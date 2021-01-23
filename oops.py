
class Customer:
    def __init__(self, name, balance):
        self.name = name
        self.balance = balance

    def getDetails(self):
        print(f'Name is {self.name} and Balance is {self.balance}')

    def deposit(self, depositMoney):
        self.balance += depositMoney
        print(f'Money Deposited Successfully new balance is {self.balance}')

    def withdraw(self, withdrawMoney):
        if withdrawMoney > self.balance:
            raise ValueError('Cant withdraw more than balance ')
        self.balance -= withdrawMoney

        print(f'Money withdrawn successfully balance is {self.balance}')


class Child(Customer):
    pass


child1 = Child("Ishank", 1000)
child1.getDetails()
